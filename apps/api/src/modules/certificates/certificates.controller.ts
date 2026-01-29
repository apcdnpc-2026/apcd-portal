import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Res,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role, CertificateStatus } from '@prisma/client';
import { Response } from 'express';

import { CertificatesService } from './certificates.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Certificates')
@ApiBearerAuth()
@Controller('certificates')
export class CertificatesController {
  constructor(private service: CertificatesService) {}

  @Get('verify/:certificateNumber')
  @Public()
  @ApiOperation({ summary: 'Verify certificate by number (public)' })
  async verifyCertificate(@Param('certificateNumber') certificateNumber: string) {
    return this.service.verifyCertificate(certificateNumber);
  }

  @Get('my-certificates')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Get certificates for current OEM' })
  async getMyCertificates(@CurrentUser() user: JwtPayload) {
    return this.service.getCertificatesForUser(user.sub);
  }

  @Get('expiring')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get certificates expiring within 60 days' })
  async getExpiringCertificates() {
    return this.service.getExpiringCertificates();
  }

  @Get('all')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get all certificates' })
  async getAllCertificates(@Query('status') status?: CertificateStatus) {
    return this.service.getAllCertificates(status);
  }

  @Get(':id')
  @Roles(Role.OEM, Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Get certificate by ID' })
  async getCertificateById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCertificateById(id);
  }

  @Get(':id/download')
  @Roles(Role.OEM, Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Download certificate PDF' })
  async downloadCertificate(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.service.generatePDFBuffer(id);
    const certificate = await this.service.getCertificateById(id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${certificate.certificateNumber.replace(/\//g, '-')}.pdf"`,
      'Content-Length': pdf.length,
    });

    res.send(pdf);
  }

  @Post('generate')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Generate certificate for approved application' })
  async generateCertificate(
    @Body() dto: { applicationId: string; remarks?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.generateCertificate(user.sub, dto);
  }

  @Put(':id/revoke')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Revoke a certificate' })
  async revokeCertificate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { reason: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.revokeCertificate(id, user.sub, dto.reason);
  }

  @Post(':id/renew')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Renew a certificate' })
  async renewCertificate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.renewCertificate(id, user.sub);
  }
}

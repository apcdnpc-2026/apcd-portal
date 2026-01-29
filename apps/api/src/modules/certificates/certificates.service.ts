import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApplicationStatus, CertificateStatus, CertificateType } from '@prisma/client';
import * as crypto from 'crypto';

import { PrismaService } from '../../infrastructure/database/prisma.service';

const CERTIFICATE_VALIDITY_YEARS = 2;

interface GenerateCertificateDto {
  applicationId: string;
  type?: CertificateType;
  remarks?: string;
}

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);
  private portalUrl: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.portalUrl = this.config.get('PORTAL_URL', 'https://apcd.npc.gov.in');
  }

  /**
   * Generate certificate for approved application
   */
  async generateCertificate(officerId: string, dto: GenerateCertificateDto) {
    const application = await this.prisma.application.findUnique({
      where: { id: dto.applicationId },
      include: {
        applicant: true,
        oemProfile: true,
        applicationApcds: {
          where: { seekingEmpanelment: true },
          include: {
            apcdType: true,
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.status !== ApplicationStatus.APPROVED) {
      throw new BadRequestException('Application is not approved');
    }

    // Check if certificate already exists
    const existingCert = await this.prisma.certificate.findFirst({
      where: {
        applicationId: dto.applicationId,
        status: CertificateStatus.ACTIVE,
      },
    });

    if (existingCert) {
      throw new BadRequestException('Active certificate already exists');
    }

    // Generate certificate number
    const certificateNumber = await this.generateCertificateNumber();

    // Generate QR code data
    const qrCodeData = `${this.portalUrl}/verify/${certificateNumber}`;

    // Calculate validity dates
    const issuedDate = new Date();
    const validFrom = new Date();
    const validUntil = new Date();
    validUntil.setFullYear(validUntil.getFullYear() + CERTIFICATE_VALIDITY_YEARS);

    // Create certificate record
    const certificate = await this.prisma.certificate.create({
      data: {
        applicationId: dto.applicationId,
        certificateNumber,
        type: dto.type || CertificateType.FINAL,
        issuedDate,
        validFrom,
        validUntil,
        qrCodeData,
        status: CertificateStatus.ACTIVE,
      },
    });

    return certificate;
  }

  /**
   * Get certificate by ID
   */
  async getCertificateById(certificateId: string) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
      include: {
        application: {
          include: {
            applicant: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
            oemProfile: {
              select: {
                companyName: true,
                fullAddress: true,
                gstRegistrationNo: true,
              },
            },
            applicationApcds: {
              where: { seekingEmpanelment: true },
              include: { apcdType: true },
            },
          },
        },
      },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    return certificate;
  }

  /**
   * Get certificate by certificate number (for public verification)
   */
  async verifyCertificate(certificateNumber: string) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { certificateNumber },
      include: {
        application: {
          include: {
            oemProfile: {
              select: {
                companyName: true,
                fullAddress: true,
              },
            },
            applicationApcds: {
              where: { seekingEmpanelment: true },
              include: { apcdType: true },
            },
          },
        },
      },
    });

    if (!certificate) {
      return {
        isValid: false,
        message: 'Certificate not found',
      };
    }

    const now = new Date();
    const isExpired = certificate.validUntil < now;
    const isRevoked = certificate.status === CertificateStatus.REVOKED;

    return {
      isValid: certificate.status === CertificateStatus.ACTIVE && !isExpired,
      certificateNumber: certificate.certificateNumber,
      status: certificate.status,
      isExpired,
      isRevoked,
      companyName: certificate.application.oemProfile?.companyName,
      address: certificate.application.oemProfile?.fullAddress,
      issuedDate: certificate.issuedDate,
      validFrom: certificate.validFrom,
      validUntil: certificate.validUntil,
      apcdTypes: certificate.application.applicationApcds.map((at) => ({
        name: at.apcdType.subType,
        category: at.apcdType.category,
      })),
      revokedAt: certificate.revokedAt,
      revocationReason: certificate.revocationReason,
    };
  }

  /**
   * Get certificates for an OEM
   */
  async getCertificatesForUser(userId: string) {
    return this.prisma.certificate.findMany({
      where: {
        application: { applicantId: userId },
      },
      include: {
        application: {
          select: { id: true, applicationNumber: true },
        },
      },
      orderBy: { issuedDate: 'desc' },
    });
  }

  /**
   * Revoke a certificate
   */
  async revokeCertificate(certificateId: string, officerId: string, reason: string) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    if (certificate.status !== CertificateStatus.ACTIVE) {
      throw new BadRequestException('Certificate is not active');
    }

    return this.prisma.certificate.update({
      where: { id: certificateId },
      data: {
        status: CertificateStatus.REVOKED,
        revokedAt: new Date(),
        revocationReason: reason,
      },
    });
  }

  /**
   * Renew certificate
   */
  async renewCertificate(certificateId: string, officerId: string) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    // Expire old certificate
    await this.prisma.certificate.update({
      where: { id: certificateId },
      data: { status: CertificateStatus.EXPIRED },
    });

    // Generate new certificate
    return this.generateCertificate(officerId, {
      applicationId: certificate.applicationId,
      remarks: `Renewed from certificate ${certificate.certificateNumber}`,
    });
  }

  /**
   * Get expiring certificates (within 60 days)
   */
  async getExpiringCertificates() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + 60);

    return this.prisma.certificate.findMany({
      where: {
        status: CertificateStatus.ACTIVE,
        validUntil: {
          lte: cutoffDate,
        },
      },
      include: {
        application: {
          include: {
            applicant: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
            oemProfile: {
              select: { companyName: true },
            },
          },
        },
      },
      orderBy: { validUntil: 'asc' },
    });
  }

  /**
   * Get all certificates (Admin view)
   */
  async getAllCertificates(status?: CertificateStatus) {
    const where = status ? { status } : {};

    return this.prisma.certificate.findMany({
      where,
      include: {
        application: {
          include: {
            oemProfile: {
              select: { companyName: true },
            },
          },
        },
      },
      orderBy: { issuedDate: 'desc' },
    });
  }

  /**
   * Generate PDF buffer for a certificate
   */
  async generatePDFBuffer(certificateId: string): Promise<Buffer> {
    const certificate = await this.getCertificateById(certificateId);

    // For now, return a placeholder PDF buffer
    // In production, use a proper PDF library like pdfkit or puppeteer
    const content = `
CERTIFICATE OF EMPANELMENT

Certificate Number: ${certificate.certificateNumber}
Type: ${certificate.type}
Status: ${certificate.status}

Company: ${certificate.application.oemProfile?.companyName}
Address: ${certificate.application.oemProfile?.fullAddress}
GST: ${certificate.application.oemProfile?.gstRegistrationNo}

Issued: ${certificate.issuedDate.toISOString().split('T')[0]}
Valid From: ${certificate.validFrom.toISOString().split('T')[0]}
Valid Until: ${certificate.validUntil.toISOString().split('T')[0]}

APCD Types:
${certificate.application.applicationApcds.map((a: any) => `- ${a.apcdType.subType} (${a.apcdType.category})`).join('\n')}

This is to certify that the above-mentioned company has been empaneled
as an APCD OEM under the National APCD Empanelment Scheme.

Verify at: ${this.portalUrl}/verify/${certificate.certificateNumber}
    `.trim();

    return Buffer.from(content, 'utf-8');
  }

  private async generateCertificateNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.certificate.count({
      where: {
        issuedDate: {
          gte: new Date(`${year}-01-01`),
        },
      },
    });

    const sequence = String(count + 1).padStart(5, '0');
    return `NPC/APCD/${year}/${sequence}`;
  }
}

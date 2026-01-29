import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApplicationStatus, CertificateStatus, CertificateType } from '@prisma/client';

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
   * Get list of empaneled OEMs (public)
   */
  async getEmpaneledOems() {
    const certificates = await this.prisma.certificate.findMany({
      where: {
        status: CertificateStatus.ACTIVE,
        validUntil: { gte: new Date() },
      },
      include: {
        application: {
          include: {
            oemProfile: {
              select: {
                companyName: true,
                fullAddress: true,
                state: true,
                contactNo: true,
              },
            },
            applicationApcds: {
              where: { seekingEmpanelment: true },
              include: { apcdType: true },
            },
          },
        },
      },
      orderBy: { issuedDate: 'desc' },
    });

    return certificates.map((cert) => ({
      certificateNumber: cert.certificateNumber,
      companyName: cert.application.oemProfile?.companyName,
      address: cert.application.oemProfile?.fullAddress,
      state: cert.application.oemProfile?.state,
      contact: cert.application.oemProfile?.contactNo,
      apcdTypes: cert.application.applicationApcds.map((a) => ({
        category: a.apcdType.category,
        subType: a.apcdType.subType,
      })),
      issuedDate: cert.issuedDate,
      validUntil: cert.validUntil,
    }));
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
    const PDFDocument = (await import('pdfkit')).default;

    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 60, right: 60 },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = doc.page.width - 120; // margins

        // Border
        doc
          .rect(30, 30, doc.page.width - 60, doc.page.height - 60)
          .lineWidth(2)
          .stroke('#1e3a5f');
        doc
          .rect(35, 35, doc.page.width - 70, doc.page.height - 70)
          .lineWidth(0.5)
          .stroke('#1e3a5f');

        // Header - Government of India / CPCB
        doc
          .fontSize(10)
          .fillColor('#666')
          .text('CENTRAL POLLUTION CONTROL BOARD', 60, 55, { align: 'center', width: pageWidth });
        doc
          .fontSize(9)
          .fillColor('#888')
          .text('(Ministry of Environment, Forest and Climate Change, Govt. of India)', 60, 70, {
            align: 'center',
            width: pageWidth,
          });

        // NPC
        doc
          .fontSize(12)
          .fillColor('#1e3a5f')
          .font('Helvetica-Bold')
          .text('NATIONAL PRODUCTIVITY COUNCIL', 60, 95, { align: 'center', width: pageWidth });

        // Line separator
        doc
          .moveTo(80, 115)
          .lineTo(doc.page.width - 80, 115)
          .lineWidth(1)
          .stroke('#1e3a5f');

        // Title
        doc
          .fontSize(20)
          .fillColor('#1e3a5f')
          .font('Helvetica-Bold')
          .text('CERTIFICATE OF EMPANELMENT', 60, 130, { align: 'center', width: pageWidth });

        const certType = certificate.type === 'PROVISIONAL' ? '(Provisional)' : '(Final)';
        doc
          .fontSize(12)
          .fillColor('#444')
          .font('Helvetica')
          .text(certType, 60, 158, { align: 'center', width: pageWidth });

        // Certificate Number
        doc
          .fontSize(11)
          .fillColor('#333')
          .font('Helvetica-Bold')
          .text(`Certificate No: ${certificate.certificateNumber}`, 60, 185, {
            align: 'center',
            width: pageWidth,
          });

        // Separator
        doc
          .moveTo(150, 205)
          .lineTo(doc.page.width - 150, 205)
          .lineWidth(0.5)
          .stroke('#ccc');

        // Body text
        const companyName = certificate.application.oemProfile?.companyName || 'N/A';
        const address = certificate.application.oemProfile?.fullAddress || 'N/A';
        const gst = certificate.application.oemProfile?.gstRegistrationNo || 'N/A';

        doc
          .fontSize(11)
          .fillColor('#333')
          .font('Helvetica')
          .text('This is to certify that', 60, 225, { align: 'center', width: pageWidth });

        doc
          .fontSize(14)
          .fillColor('#1e3a5f')
          .font('Helvetica-Bold')
          .text(companyName, 60, 248, { align: 'center', width: pageWidth });

        doc
          .fontSize(10)
          .fillColor('#555')
          .font('Helvetica')
          .text(address, 60, 272, { align: 'center', width: pageWidth });

        doc
          .fontSize(10)
          .fillColor('#555')
          .text(`GST: ${gst}`, 60, 292, { align: 'center', width: pageWidth });

        doc
          .fontSize(11)
          .fillColor('#333')
          .font('Helvetica')
          .text(
            'has been empaneled as an Air Pollution Control Device (APCD) Original Equipment Manufacturer (OEM) under the National APCD OEM Empanelment Scheme administered by the National Productivity Council for the Central Pollution Control Board.',
            60,
            320,
            { align: 'center', width: pageWidth, lineGap: 4 },
          );

        // APCD Types Table
        const apcds = certificate.application.applicationApcds || [];
        let yPos = 390;

        doc
          .fontSize(11)
          .fillColor('#1e3a5f')
          .font('Helvetica-Bold')
          .text('Empaneled APCD Types:', 60, yPos);
        yPos += 20;

        // Table header
        doc.rect(60, yPos, pageWidth, 22).fill('#1e3a5f');
        doc
          .fontSize(9)
          .fillColor('#fff')
          .font('Helvetica-Bold')
          .text('S.No.', 65, yPos + 6, { width: 40 })
          .text('Category', 110, yPos + 6, { width: 180 })
          .text('Sub-Type', 295, yPos + 6, { width: 200 });
        yPos += 22;

        // Table rows
        apcds.forEach((apcd: any, i: number) => {
          const bgColor = i % 2 === 0 ? '#f5f5f5' : '#ffffff';
          doc.rect(60, yPos, pageWidth, 20).fill(bgColor);
          doc
            .fontSize(9)
            .fillColor('#333')
            .font('Helvetica')
            .text(String(i + 1), 65, yPos + 5, { width: 40 })
            .text(apcd.apcdType?.category?.replace(/_/g, ' ') || '', 110, yPos + 5, { width: 180 })
            .text(apcd.apcdType?.subType || '', 295, yPos + 5, { width: 200 });
          yPos += 20;
        });

        // Table border
        doc
          .rect(60, 390 + 20, pageWidth, (apcds.length + 1) * 20 + 2)
          .lineWidth(0.5)
          .stroke('#ccc');

        // Validity
        yPos += 20;
        const formatDateStr = (d: Date) =>
          d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

        doc
          .fontSize(10)
          .fillColor('#333')
          .font('Helvetica-Bold')
          .text('Validity Period:', 60, yPos);
        doc
          .font('Helvetica')
          .text(
            `From: ${formatDateStr(certificate.validFrom)}    To: ${formatDateStr(certificate.validUntil)}`,
            160,
            yPos,
          );

        yPos += 25;
        doc.fontSize(10).fillColor('#333').font('Helvetica-Bold').text('Date of Issue:', 60, yPos);
        doc.font('Helvetica').text(formatDateStr(certificate.issuedDate), 160, yPos);

        // QR Code placeholder
        yPos += 40;
        doc.rect(60, yPos, 80, 80).lineWidth(0.5).stroke('#ccc');
        doc
          .fontSize(7)
          .fillColor('#999')
          .text('QR Code', 75, yPos + 35)
          .text('Scan to verify', 68, yPos + 45);

        // Verification URL
        doc
          .fontSize(8)
          .fillColor('#666')
          .text(
            `Verify: ${certificate.qrCodeData || this.portalUrl + '/verify/' + certificate.certificateNumber}`,
            150,
            yPos + 30,
          );

        // Signatures
        const sigY = yPos + 80;
        doc
          .fontSize(9)
          .fillColor('#333')
          .font('Helvetica')
          .text('_________________________', 60, sigY)
          .text('Director General', 60, sigY + 15)
          .text('National Productivity Council', 60, sigY + 28);

        doc
          .text('_________________________', 350, sigY)
          .text('Member Secretary', 350, sigY + 15)
          .text('Central Pollution Control Board', 350, sigY + 28);

        // Footer
        doc
          .fontSize(7)
          .fillColor('#999')
          .text(
            'This is a computer-generated certificate. The authenticity can be verified by scanning the QR code or visiting the verification URL.',
            60,
            doc.page.height - 65,
            { align: 'center', width: pageWidth },
          );

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
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

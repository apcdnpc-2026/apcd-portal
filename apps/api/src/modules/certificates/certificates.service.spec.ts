import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PrismaClient,
  ApplicationStatus,
  CertificateStatus,
  CertificateType,
} from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { CertificatesService } from './certificates.service';

// Mock pdfkit so generatePDFBuffer doesn't need real PDF rendering
jest.mock('pdfkit', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const EventEmitter = require('events');
      const emitter = new EventEmitter();
      const doc: any = emitter;
      doc.fontSize = jest.fn().mockReturnValue(doc);
      doc.fillColor = jest.fn().mockReturnValue(doc);
      doc.font = jest.fn().mockReturnValue(doc);
      doc.text = jest.fn().mockReturnValue(doc);
      doc.rect = jest.fn().mockReturnValue(doc);
      doc.lineWidth = jest.fn().mockReturnValue(doc);
      doc.stroke = jest.fn().mockReturnValue(doc);
      doc.fill = jest.fn().mockReturnValue(doc);
      doc.moveTo = jest.fn().mockReturnValue(doc);
      doc.lineTo = jest.fn().mockReturnValue(doc);
      doc.page = { width: 595, height: 842 };
      doc.end = jest.fn().mockImplementation(() => {
        const chunk = Buffer.from('mock-pdf-content');
        doc.emit('data', chunk);
        doc.emit('end');
      });
      return doc;
    }),
  };
});

describe('CertificatesService', () => {
  let service: CertificatesService;
  let prisma: DeepMockProxy<PrismaClient>;

  const OFFICER_ID = 'officer-001';
  const APP_ID = 'app-001';
  const CERT_ID = 'cert-001';
  const CERT_NUMBER = 'NPC/APCD/2026/00001';

  const mockApplication = {
    id: APP_ID,
    status: ApplicationStatus.APPROVED,
    applicantId: 'user-001',
    applicationNumber: 'APCD-2026-00001',
    applicant: { id: 'user-001', email: 'test@example.com', firstName: 'John', lastName: 'Doe' },
    oemProfile: {
      companyName: 'Test Corp',
      fullAddress: '123 Main St, Delhi',
      gstRegistrationNo: 'GST123456',
      state: 'Delhi',
      contactNo: '9876543210',
    },
    applicationApcds: [
      {
        seekingEmpanelment: true,
        apcdType: { category: 'DUST_COLLECTOR', subType: 'Bag Filter' },
      },
    ],
  };

  const now = new Date();
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 2);
  const pastDate = new Date('2023-01-01');

  const mockCertificate = {
    id: CERT_ID,
    applicationId: APP_ID,
    certificateNumber: CERT_NUMBER,
    type: CertificateType.FINAL,
    issuedDate: now,
    validFrom: now,
    validUntil: futureDate,
    qrCodeData: `https://apcd.npc.gov.in/verify/${CERT_NUMBER}`,
    status: CertificateStatus.ACTIVE,
    revokedAt: null,
    revocationReason: null,
  };

  const mockCertificateWithApp = {
    ...mockCertificate,
    application: mockApplication,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificatesService,
        { provide: PrismaService, useValue: mockDeep<PrismaClient>() },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('https://apcd.npc.gov.in') },
        },
      ],
    }).compile();

    service = module.get<CertificatesService>(CertificatesService);
    prisma = module.get(PrismaService);
  });

  // ─── generateCertificate ──────────────────────────────────────────

  describe('generateCertificate', () => {
    it('should create an ACTIVE certificate with 2-year validity for an APPROVED application', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.certificate.findFirst.mockResolvedValue(null);
      prisma.certificate.count.mockResolvedValue(0);
      prisma.certificate.create.mockResolvedValue(mockCertificate as any);

      const result = await service.generateCertificate(OFFICER_ID, { applicationId: APP_ID });

      expect(result).toEqual(mockCertificate);
      expect(prisma.certificate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            applicationId: APP_ID,
            status: CertificateStatus.ACTIVE,
            certificateNumber: expect.stringMatching(/^NPC\/APCD\/\d{4}\/\d{5}$/),
          }),
        }),
      );
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(
        service.generateCertificate(OFFICER_ID, { applicationId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when application is not APPROVED', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
      } as any);

      await expect(
        service.generateCertificate(OFFICER_ID, { applicationId: APP_ID }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when an active certificate already exists', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.certificate.findFirst.mockResolvedValue(mockCertificate as any);

      await expect(
        service.generateCertificate(OFFICER_ID, { applicationId: APP_ID }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── verifyCertificate ────────────────────────────────────────────

  describe('verifyCertificate', () => {
    it('should return isValid true for an active, non-expired certificate', async () => {
      prisma.certificate.findUnique.mockResolvedValue(mockCertificateWithApp as any);

      const result = await service.verifyCertificate(CERT_NUMBER);

      expect(result.isValid).toBe(true);
      expect(result.certificateNumber).toBe(CERT_NUMBER);
      expect(result.companyName).toBe('Test Corp');
      expect(result.isExpired).toBe(false);
      expect(result.isRevoked).toBe(false);
    });

    it('should return isValid false for an expired certificate', async () => {
      const expiredCert = {
        ...mockCertificateWithApp,
        validUntil: pastDate,
      };
      prisma.certificate.findUnique.mockResolvedValue(expiredCert as any);

      const result = await service.verifyCertificate(CERT_NUMBER);

      expect(result.isValid).toBe(false);
      expect(result.isExpired).toBe(true);
    });

    it('should return isValid false when certificate is not found', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);

      const result = await service.verifyCertificate('NPC/APCD/2026/99999');

      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Certificate not found');
    });

    it('should return isValid false for a revoked certificate', async () => {
      const revokedCert = {
        ...mockCertificateWithApp,
        status: CertificateStatus.REVOKED,
        revokedAt: now,
        revocationReason: 'Fraud detected',
      };
      prisma.certificate.findUnique.mockResolvedValue(revokedCert as any);

      const result = await service.verifyCertificate(CERT_NUMBER);

      expect(result.isValid).toBe(false);
      expect(result.isRevoked).toBe(true);
    });
  });

  // ─── revokeCertificate ────────────────────────────────────────────

  describe('revokeCertificate', () => {
    it('should revoke an active certificate and set reason', async () => {
      const revokedCert = {
        ...mockCertificate,
        status: CertificateStatus.REVOKED,
        revokedAt: now,
        revocationReason: 'Non-compliance',
      };
      prisma.certificate.findUnique.mockResolvedValue(mockCertificate as any);
      prisma.certificate.update.mockResolvedValue(revokedCert as any);

      const result = await service.revokeCertificate(CERT_ID, OFFICER_ID, 'Non-compliance');

      expect(result.status).toBe(CertificateStatus.REVOKED);
      expect(result.revocationReason).toBe('Non-compliance');
      expect(prisma.certificate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CERT_ID },
          data: expect.objectContaining({
            status: CertificateStatus.REVOKED,
            revocationReason: 'Non-compliance',
          }),
        }),
      );
    });

    it('should throw NotFoundException when certificate does not exist', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);

      await expect(service.revokeCertificate('non-existent', OFFICER_ID, 'reason')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when certificate is not active', async () => {
      const expiredCert = { ...mockCertificate, status: CertificateStatus.EXPIRED };
      prisma.certificate.findUnique.mockResolvedValue(expiredCert as any);

      await expect(service.revokeCertificate(CERT_ID, OFFICER_ID, 'reason')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── renewCertificate ─────────────────────────────────────────────

  describe('renewCertificate', () => {
    it('should expire the old certificate and generate a new one', async () => {
      const newCert = {
        ...mockCertificate,
        id: 'cert-002',
        certificateNumber: 'NPC/APCD/2026/00002',
      };

      // First findUnique for renewCertificate lookup
      prisma.certificate.findUnique.mockResolvedValueOnce(mockCertificate as any);
      // Update old cert to EXPIRED
      prisma.certificate.update.mockResolvedValueOnce({
        ...mockCertificate,
        status: CertificateStatus.EXPIRED,
      } as any);
      // generateCertificate internals
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.certificate.findFirst.mockResolvedValue(null);
      prisma.certificate.count.mockResolvedValue(1);
      prisma.certificate.create.mockResolvedValue(newCert as any);

      const result = await service.renewCertificate(CERT_ID, OFFICER_ID);

      expect(prisma.certificate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CERT_ID },
          data: { status: CertificateStatus.EXPIRED },
        }),
      );
      expect(result.id).toBe('cert-002');
    });

    it('should throw NotFoundException when certificate to renew does not exist', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);

      await expect(service.renewCertificate('non-existent', OFFICER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getCertificateById ───────────────────────────────────────────

  describe('getCertificateById', () => {
    it('should return the certificate with application details', async () => {
      prisma.certificate.findUnique.mockResolvedValue(mockCertificateWithApp as any);

      const result = await service.getCertificateById(CERT_ID);

      expect(result.id).toBe(CERT_ID);
      expect(result.application.oemProfile.companyName).toBe('Test Corp');
    });

    it('should throw NotFoundException when certificate is not found', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);

      await expect(service.getCertificateById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── generatePDFBuffer ────────────────────────────────────────────

  describe('generatePDFBuffer', () => {
    it('should return a Buffer with PDF content', async () => {
      prisma.certificate.findUnique.mockResolvedValue(mockCertificateWithApp as any);

      const result = await service.generatePDFBuffer(CERT_ID);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });
});

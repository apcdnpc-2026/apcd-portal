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
  const USER_ID = 'user-001';
  const CERT_NUMBER = 'NPC/APCD/2026/00001';

  const mockApplication = {
    id: APP_ID,
    status: ApplicationStatus.APPROVED,
    applicantId: USER_ID,
    applicationNumber: 'APCD-2026-00001',
    applicant: { id: USER_ID, email: 'test@example.com', firstName: 'John', lastName: 'Doe' },
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

    it('should generate certificate number with correct year and zero-padded sequence', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.certificate.findFirst.mockResolvedValue(null);
      prisma.certificate.count.mockResolvedValue(41); // 42nd certificate this year
      prisma.certificate.create.mockResolvedValue(mockCertificate as any);

      await service.generateCertificate(OFFICER_ID, { applicationId: APP_ID });

      const year = new Date().getFullYear();
      expect(prisma.certificate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            certificateNumber: `NPC/APCD/${year}/00042`,
          }),
        }),
      );
    });

    it('should default type to FINAL when not provided', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.certificate.findFirst.mockResolvedValue(null);
      prisma.certificate.count.mockResolvedValue(0);
      prisma.certificate.create.mockResolvedValue(mockCertificate as any);

      await service.generateCertificate(OFFICER_ID, { applicationId: APP_ID });

      expect(prisma.certificate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: CertificateType.FINAL,
          }),
        }),
      );
    });

    it('should use PROVISIONAL type when explicitly provided', async () => {
      const provisionalCert = { ...mockCertificate, type: CertificateType.PROVISIONAL };
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.certificate.findFirst.mockResolvedValue(null);
      prisma.certificate.count.mockResolvedValue(0);
      prisma.certificate.create.mockResolvedValue(provisionalCert as any);

      await service.generateCertificate(OFFICER_ID, {
        applicationId: APP_ID,
        type: CertificateType.PROVISIONAL,
      });

      expect(prisma.certificate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: CertificateType.PROVISIONAL,
          }),
        }),
      );
    });

    it('should include qrCodeData with the portal URL and certificate number', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.certificate.findFirst.mockResolvedValue(null);
      prisma.certificate.count.mockResolvedValue(0);
      prisma.certificate.create.mockResolvedValue(mockCertificate as any);

      await service.generateCertificate(OFFICER_ID, { applicationId: APP_ID });

      expect(prisma.certificate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            qrCodeData: expect.stringContaining('https://apcd.npc.gov.in/verify/'),
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

    it('should throw BadRequestException when application is in DRAFT status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.DRAFT,
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

    it('should throw BadRequestException with "Active certificate already exists" message', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.certificate.findFirst.mockResolvedValue(mockCertificate as any);

      await expect(
        service.generateCertificate(OFFICER_ID, { applicationId: APP_ID }),
      ).rejects.toThrow('Active certificate already exists');
    });

    it('should set validUntil to 2 years from now', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.certificate.findFirst.mockResolvedValue(null);
      prisma.certificate.count.mockResolvedValue(0);
      prisma.certificate.create.mockResolvedValue(mockCertificate as any);

      await service.generateCertificate(OFFICER_ID, { applicationId: APP_ID });

      const createCall = prisma.certificate.create.mock.calls[0][0];
      const validUntil = createCall.data.validUntil as Date;
      const validFrom = createCall.data.validFrom as Date;
      const diffMs = validUntil.getTime() - validFrom.getTime();
      const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
      expect(diffYears).toBeCloseTo(2, 0);
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

    it('should return APCD types in the verification response', async () => {
      prisma.certificate.findUnique.mockResolvedValue(mockCertificateWithApp as any);

      const result = await service.verifyCertificate(CERT_NUMBER);

      expect(result.apcdTypes).toEqual([
        { name: 'Bag Filter', category: 'DUST_COLLECTOR' },
      ]);
    });

    it('should return validity dates in the verification response', async () => {
      prisma.certificate.findUnique.mockResolvedValue(mockCertificateWithApp as any);

      const result = await service.verifyCertificate(CERT_NUMBER);

      expect(result.validFrom).toEqual(now);
      expect(result.validUntil).toEqual(futureDate);
      expect(result.issuedDate).toEqual(now);
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

    it('should not include certificate details when not found', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);

      const result = await service.verifyCertificate('INVALID-NUMBER');

      expect(result.isValid).toBe(false);
      expect(result).not.toHaveProperty('certificateNumber');
      expect(result).not.toHaveProperty('companyName');
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
      expect(result.revokedAt).toEqual(now);
      expect(result.revocationReason).toBe('Fraud detected');
    });

    it('should return isValid false for a SUSPENDED certificate', async () => {
      const suspendedCert = {
        ...mockCertificateWithApp,
        status: CertificateStatus.SUSPENDED,
      };
      prisma.certificate.findUnique.mockResolvedValue(suspendedCert as any);

      const result = await service.verifyCertificate(CERT_NUMBER);

      expect(result.isValid).toBe(false);
      expect(result.status).toBe(CertificateStatus.SUSPENDED);
    });

    it('should return isValid false for an EXPIRED status certificate even with future validUntil', async () => {
      const expiredStatusCert = {
        ...mockCertificateWithApp,
        status: CertificateStatus.EXPIRED,
      };
      prisma.certificate.findUnique.mockResolvedValue(expiredStatusCert as any);

      const result = await service.verifyCertificate(CERT_NUMBER);

      expect(result.isValid).toBe(false);
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
            revokedAt: expect.any(Date),
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

    it('should throw BadRequestException when certificate is already REVOKED', async () => {
      const revokedCert = {
        ...mockCertificate,
        status: CertificateStatus.REVOKED,
        revokedAt: now,
        revocationReason: 'Previous reason',
      };
      prisma.certificate.findUnique.mockResolvedValue(revokedCert as any);

      await expect(
        service.revokeCertificate(CERT_ID, OFFICER_ID, 'New reason'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when certificate is EXPIRED', async () => {
      const expiredCert = { ...mockCertificate, status: CertificateStatus.EXPIRED };
      prisma.certificate.findUnique.mockResolvedValue(expiredCert as any);

      await expect(service.revokeCertificate(CERT_ID, OFFICER_ID, 'reason')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when certificate is SUSPENDED', async () => {
      const suspendedCert = { ...mockCertificate, status: CertificateStatus.SUSPENDED };
      prisma.certificate.findUnique.mockResolvedValue(suspendedCert as any);

      await expect(service.revokeCertificate(CERT_ID, OFFICER_ID, 'reason')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw with "Certificate is not active" message for non-active certificate', async () => {
      const expiredCert = { ...mockCertificate, status: CertificateStatus.EXPIRED };
      prisma.certificate.findUnique.mockResolvedValue(expiredCert as any);

      await expect(service.revokeCertificate(CERT_ID, OFFICER_ID, 'reason')).rejects.toThrow(
        'Certificate is not active',
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

    it('should pass renewal remarks referencing old certificate number', async () => {
      const newCert = {
        ...mockCertificate,
        id: 'cert-002',
        certificateNumber: 'NPC/APCD/2026/00002',
      };

      prisma.certificate.findUnique.mockResolvedValueOnce(mockCertificate as any);
      prisma.certificate.update.mockResolvedValueOnce({
        ...mockCertificate,
        status: CertificateStatus.EXPIRED,
      } as any);
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.certificate.findFirst.mockResolvedValue(null);
      prisma.certificate.count.mockResolvedValue(1);
      prisma.certificate.create.mockResolvedValue(newCert as any);

      await service.renewCertificate(CERT_ID, OFFICER_ID);

      // The generateCertificate is called internally with the old cert's applicationId
      expect(prisma.application.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: APP_ID },
        }),
      );
    });

    it('should throw NotFoundException when certificate to renew does not exist', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);

      await expect(service.renewCertificate('non-existent', OFFICER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException with "Certificate not found" message', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);

      await expect(service.renewCertificate('non-existent', OFFICER_ID)).rejects.toThrow(
        'Certificate not found',
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

    it('should include applicant info in the response', async () => {
      prisma.certificate.findUnique.mockResolvedValue(mockCertificateWithApp as any);

      const result = await service.getCertificateById(CERT_ID);

      expect(result.application.applicant).toEqual(
        expect.objectContaining({
          id: USER_ID,
          email: 'test@example.com',
        }),
      );
    });

    it('should include applicationApcds in the response', async () => {
      prisma.certificate.findUnique.mockResolvedValue(mockCertificateWithApp as any);

      const result = await service.getCertificateById(CERT_ID);

      expect(result.application.applicationApcds).toHaveLength(1);
      expect(result.application.applicationApcds[0].apcdType.subType).toBe('Bag Filter');
    });

    it('should throw NotFoundException when certificate is not found', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);

      await expect(service.getCertificateById('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should throw with "Certificate not found" message', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);

      await expect(service.getCertificateById('non-existent')).rejects.toThrow(
        'Certificate not found',
      );
    });

    it('should query Prisma with the correct include shape', async () => {
      prisma.certificate.findUnique.mockResolvedValue(mockCertificateWithApp as any);

      await service.getCertificateById(CERT_ID);

      expect(prisma.certificate.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CERT_ID },
          include: expect.objectContaining({
            application: expect.objectContaining({
              include: expect.objectContaining({
                applicant: expect.any(Object),
                oemProfile: expect.any(Object),
                applicationApcds: expect.any(Object),
              }),
            }),
          }),
        }),
      );
    });
  });

  // ─── getEmpaneledOems ─────────────────────────────────────────────

  describe('getEmpaneledOems', () => {
    it('should return mapped list of empaneled OEMs with active certificates', async () => {
      prisma.certificate.findMany.mockResolvedValue([mockCertificateWithApp] as any);

      const result = await service.getEmpaneledOems();

      expect(result).toHaveLength(1);
      expect(result[0].certificateNumber).toBe(CERT_NUMBER);
      expect(result[0].companyName).toBe('Test Corp');
      expect(result[0].address).toBe('123 Main St, Delhi');
      expect(result[0].state).toBe('Delhi');
      expect(result[0].contact).toBe('9876543210');
    });

    it('should map APCD types correctly', async () => {
      prisma.certificate.findMany.mockResolvedValue([mockCertificateWithApp] as any);

      const result = await service.getEmpaneledOems();

      expect(result[0].apcdTypes).toEqual([
        { category: 'DUST_COLLECTOR', subType: 'Bag Filter' },
      ]);
    });

    it('should set empanelmentStatus to "Final" for FINAL type with distant expiry', async () => {
      prisma.certificate.findMany.mockResolvedValue([mockCertificateWithApp] as any);

      const result = await service.getEmpaneledOems();

      expect(result[0].empanelmentStatus).toBe('Final');
    });

    it('should set empanelmentStatus to "Provisional" for PROVISIONAL type', async () => {
      const provisionalCert = {
        ...mockCertificateWithApp,
        type: CertificateType.PROVISIONAL,
      };
      prisma.certificate.findMany.mockResolvedValue([provisionalCert] as any);

      const result = await service.getEmpaneledOems();

      expect(result[0].empanelmentStatus).toBe('Provisional');
    });

    it('should set empanelmentStatus to "Renewal Due" for FINAL type expiring within 60 days', async () => {
      const soonExpiry = new Date();
      soonExpiry.setDate(soonExpiry.getDate() + 30); // 30 days from now (within 60-day cutoff)
      const renewalDueCert = {
        ...mockCertificateWithApp,
        type: CertificateType.FINAL,
        validUntil: soonExpiry,
      };
      prisma.certificate.findMany.mockResolvedValue([renewalDueCert] as any);

      const result = await service.getEmpaneledOems();

      expect(result[0].empanelmentStatus).toBe('Renewal Due');
    });

    it('should return empty array when no active certificates exist', async () => {
      prisma.certificate.findMany.mockResolvedValue([]);

      const result = await service.getEmpaneledOems();

      expect(result).toEqual([]);
    });

    it('should query only ACTIVE certificates with valid dates', async () => {
      prisma.certificate.findMany.mockResolvedValue([]);

      await service.getEmpaneledOems();

      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: CertificateStatus.ACTIVE,
            validUntil: { gte: expect.any(Date) },
          }),
          orderBy: { issuedDate: 'desc' },
        }),
      );
    });

    it('should include issuedDate and validUntil in the response', async () => {
      prisma.certificate.findMany.mockResolvedValue([mockCertificateWithApp] as any);

      const result = await service.getEmpaneledOems();

      expect(result[0].issuedDate).toEqual(now);
      expect(result[0].validUntil).toEqual(futureDate);
    });
  });

  // ─── getCertificatesForUser (getMyCertificates) ────────────────────

  describe('getCertificatesForUser', () => {
    it('should return certificates belonging to the specified user', async () => {
      const certWithApp = {
        ...mockCertificate,
        application: { id: APP_ID, applicationNumber: 'APCD-2026-00001' },
      };
      prisma.certificate.findMany.mockResolvedValue([certWithApp] as any);

      const result = await service.getCertificatesForUser(USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].certificateNumber).toBe(CERT_NUMBER);
    });

    it('should query with the correct applicantId filter', async () => {
      prisma.certificate.findMany.mockResolvedValue([]);

      await service.getCertificatesForUser(USER_ID);

      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            application: { applicantId: USER_ID },
          },
          orderBy: { issuedDate: 'desc' },
        }),
      );
    });

    it('should return empty array when user has no certificates', async () => {
      prisma.certificate.findMany.mockResolvedValue([]);

      const result = await service.getCertificatesForUser('user-with-no-certs');

      expect(result).toEqual([]);
    });

    it('should include application id and number in the response', async () => {
      const certWithApp = {
        ...mockCertificate,
        application: { id: APP_ID, applicationNumber: 'APCD-2026-00001' },
      };
      prisma.certificate.findMany.mockResolvedValue([certWithApp] as any);

      const result = await service.getCertificatesForUser(USER_ID);

      expect(result[0].application).toEqual({
        id: APP_ID,
        applicationNumber: 'APCD-2026-00001',
      });
    });
  });

  // ─── getExpiringCertificates ──────────────────────────────────────

  describe('getExpiringCertificates', () => {
    it('should return active certificates expiring within 60 days', async () => {
      const soonExpiry = new Date();
      soonExpiry.setDate(soonExpiry.getDate() + 30);
      const expiringCert = {
        ...mockCertificate,
        validUntil: soonExpiry,
        application: {
          applicant: { id: USER_ID, email: 'test@example.com', firstName: 'John', lastName: 'Doe' },
          oemProfile: { companyName: 'Test Corp' },
        },
      };
      prisma.certificate.findMany.mockResolvedValue([expiringCert] as any);

      const result = await service.getExpiringCertificates();

      expect(result).toHaveLength(1);
    });

    it('should query with ACTIVE status and cutoff date', async () => {
      prisma.certificate.findMany.mockResolvedValue([]);

      await service.getExpiringCertificates();

      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: CertificateStatus.ACTIVE,
            validUntil: { lte: expect.any(Date) },
          }),
          orderBy: { validUntil: 'asc' },
        }),
      );
    });

    it('should return empty array when no certificates are expiring soon', async () => {
      prisma.certificate.findMany.mockResolvedValue([]);

      const result = await service.getExpiringCertificates();

      expect(result).toEqual([]);
    });

    it('should include applicant and OEM profile in the response', async () => {
      const expiringCert = {
        ...mockCertificate,
        application: {
          applicant: { id: USER_ID, email: 'test@example.com', firstName: 'John', lastName: 'Doe' },
          oemProfile: { companyName: 'Test Corp' },
        },
      };
      prisma.certificate.findMany.mockResolvedValue([expiringCert] as any);

      const result = await service.getExpiringCertificates();

      expect((result[0] as any).application.applicant.email).toBe('test@example.com');
      expect((result[0] as any).application.oemProfile.companyName).toBe('Test Corp');
    });
  });

  // ─── getAllCertificates ───────────────────────────────────────────

  describe('getAllCertificates', () => {
    it('should return all certificates when no status filter provided', async () => {
      prisma.certificate.findMany.mockResolvedValue([mockCertificateWithApp] as any);

      const result = await service.getAllCertificates();

      expect(result).toHaveLength(1);
      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: { issuedDate: 'desc' },
        }),
      );
    });

    it('should filter by ACTIVE status when provided', async () => {
      prisma.certificate.findMany.mockResolvedValue([mockCertificateWithApp] as any);

      await service.getAllCertificates(CertificateStatus.ACTIVE);

      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: CertificateStatus.ACTIVE },
        }),
      );
    });

    it('should filter by REVOKED status when provided', async () => {
      prisma.certificate.findMany.mockResolvedValue([]);

      await service.getAllCertificates(CertificateStatus.REVOKED);

      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: CertificateStatus.REVOKED },
        }),
      );
    });

    it('should filter by EXPIRED status when provided', async () => {
      prisma.certificate.findMany.mockResolvedValue([]);

      await service.getAllCertificates(CertificateStatus.EXPIRED);

      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: CertificateStatus.EXPIRED },
        }),
      );
    });

    it('should filter by SUSPENDED status when provided', async () => {
      prisma.certificate.findMany.mockResolvedValue([]);

      await service.getAllCertificates(CertificateStatus.SUSPENDED);

      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: CertificateStatus.SUSPENDED },
        }),
      );
    });

    it('should include oemProfile companyName via application', async () => {
      prisma.certificate.findMany.mockResolvedValue([mockCertificateWithApp] as any);

      await service.getAllCertificates();

      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            application: expect.objectContaining({
              include: expect.objectContaining({
                oemProfile: expect.any(Object),
              }),
            }),
          }),
        }),
      );
    });

    it('should return empty array when no certificates match the filter', async () => {
      prisma.certificate.findMany.mockResolvedValue([]);

      const result = await service.getAllCertificates(CertificateStatus.SUSPENDED);

      expect(result).toEqual([]);
    });
  });

  // ─── generatePDFBuffer (downloadPDF) ──────────────────────────────

  describe('generatePDFBuffer', () => {
    it('should return a Buffer with PDF content', async () => {
      prisma.certificate.findUnique.mockResolvedValue(mockCertificateWithApp as any);

      const result = await service.generatePDFBuffer(CERT_ID);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should throw NotFoundException when certificate does not exist', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);

      await expect(service.generatePDFBuffer('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should call getCertificateById internally to fetch certificate data', async () => {
      prisma.certificate.findUnique.mockResolvedValue(mockCertificateWithApp as any);

      await service.generatePDFBuffer(CERT_ID);

      expect(prisma.certificate.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CERT_ID },
        }),
      );
    });

    it('should handle certificate with no applicationApcds', async () => {
      const certNoApcds = {
        ...mockCertificateWithApp,
        application: {
          ...mockApplication,
          applicationApcds: [],
        },
      };
      prisma.certificate.findUnique.mockResolvedValue(certNoApcds as any);

      const result = await service.generatePDFBuffer(CERT_ID);

      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should handle certificate with null oemProfile fields', async () => {
      const certNullProfile = {
        ...mockCertificateWithApp,
        application: {
          ...mockApplication,
          oemProfile: {
            companyName: null,
            fullAddress: null,
            gstRegistrationNo: null,
          },
        },
      };
      prisma.certificate.findUnique.mockResolvedValue(certNullProfile as any);

      const result = await service.generatePDFBuffer(CERT_ID);

      expect(Buffer.isBuffer(result)).toBe(true);
    });
  });
});

import { DocumentType, MANDATORY_DOCUMENTS } from '@apcd/shared';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { ApplicationValidatorService } from './application-validator.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal "complete" application that passes every validation rule. */
function buildValidApplication(overrides: Record<string, any> = {}) {
  // One attachment per mandatory document type
  const mandatoryAttachments = MANDATORY_DOCUMENTS.map((doc) => ({
    id: `att-${doc.type}`,
    documentType: doc.type as DocumentType,
    hasValidGeoTag: doc.type === DocumentType.GEO_TAGGED_PHOTOS ? true : false,
  }));

  // Add a second geo-tagged photo (rule 9 requires >= 2)
  mandatoryAttachments.push({
    id: 'att-GEO_TAGGED_PHOTOS_2',
    documentType: DocumentType.GEO_TAGGED_PHOTOS,
    hasValidGeoTag: true,
  });

  return {
    id: 'app-1',
    oemProfile: { id: 'profile-1' },
    contactPersons: [{ id: 'cp-1' }],
    turnoverYear1: 1_000_000,
    turnoverYear2: 1_200_000,
    turnoverYear3: 1_500_000,
    hasISO9001: true,
    hasISO14001: false,
    hasISO45001: false,
    applicationApcds: [{ id: 'apcd-1', seekingEmpanelment: true }],
    installationExperiences: [{ id: 'exp-1' }, { id: 'exp-2' }, { id: 'exp-3' }],
    staffDetails: [
      { id: 'staff-1', qualification: 'B.Tech Mechanical' },
      { id: 'staff-2', qualification: 'M.Tech Environmental' },
    ],
    attachments: mandatoryAttachments,
    payments: [{ id: 'pay-1', paymentType: 'APPLICATION_FEE', status: 'COMPLETED' }],
    declarationAccepted: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ApplicationValidatorService', () => {
  let service: ApplicationValidatorService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ApplicationValidatorService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ApplicationValidatorService>(ApplicationValidatorService);
  });

  // -----------------------------------------------------------------------
  // 0. Application not found
  // -----------------------------------------------------------------------
  it('should throw BadRequestException when application does not exist', async () => {
    (prisma.application.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.validateForSubmission('non-existent')).rejects.toThrow(
      BadRequestException,
    );
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------
  it('should return no errors for a fully valid application', async () => {
    (prisma.application.findUnique as jest.Mock).mockResolvedValue(buildValidApplication());

    const errors = await service.validateForSubmission('app-1');
    expect(errors).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Rule 1 - OEM profile
  // -----------------------------------------------------------------------
  describe('Rule 1 - OEM Profile', () => {
    it('should return error when oemProfile is missing', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({ oemProfile: null }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('Company profile (Fields 1-14) must be completed');
    });

    it('should return error when oemProfile is undefined', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({ oemProfile: undefined }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('Company profile (Fields 1-14) must be completed');
    });
  });

  // -----------------------------------------------------------------------
  // Rule 2 - Contact persons
  // -----------------------------------------------------------------------
  describe('Rule 2 - Contact persons', () => {
    it('should return error when there are no contact persons', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({ contactPersons: [] }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('At least one contact person is required (Field 15 or 16)');
    });

    it('should pass with exactly one contact person', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({ contactPersons: [{ id: 'cp-1' }] }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).not.toContain('At least one contact person is required (Field 15 or 16)');
    });

    it('should pass with multiple contact persons', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({ contactPersons: [{ id: 'cp-1' }, { id: 'cp-2' }] }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).not.toContain('At least one contact person is required (Field 15 or 16)');
    });
  });

  // -----------------------------------------------------------------------
  // Rule 3 - Turnover data
  // -----------------------------------------------------------------------
  describe('Rule 3 - Turnover data', () => {
    it('should return error when turnoverYear1 is missing', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({ turnoverYear1: null }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('Year-wise turnover for last 3 years is required (Field 17)');
    });

    it('should return error when turnoverYear2 is missing', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({ turnoverYear2: null }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('Year-wise turnover for last 3 years is required (Field 17)');
    });

    it('should return error when turnoverYear3 is missing', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({ turnoverYear3: null }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('Year-wise turnover for last 3 years is required (Field 17)');
    });

    it('should return error when all turnover years are missing', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          turnoverYear1: null,
          turnoverYear2: null,
          turnoverYear3: null,
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('Year-wise turnover for last 3 years is required (Field 17)');
    });

    it('should pass when all three turnover years are provided', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(buildValidApplication());

      const errors = await service.validateForSubmission('app-1');
      expect(errors).not.toContain('Year-wise turnover for last 3 years is required (Field 17)');
    });
  });

  // -----------------------------------------------------------------------
  // Rule 4 - ISO certifications
  // -----------------------------------------------------------------------
  describe('Rule 4 - ISO certifications', () => {
    it('should return error when no ISO certification is present', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          hasISO9001: false,
          hasISO14001: false,
          hasISO45001: false,
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('At least one ISO certification is required (Field 19)');
    });

    it('should pass when only hasISO9001 is true', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          hasISO9001: true,
          hasISO14001: false,
          hasISO45001: false,
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).not.toContain('At least one ISO certification is required (Field 19)');
    });

    it('should pass when only hasISO14001 is true', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          hasISO9001: false,
          hasISO14001: true,
          hasISO45001: false,
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).not.toContain('At least one ISO certification is required (Field 19)');
    });

    it('should pass when only hasISO45001 is true', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          hasISO9001: false,
          hasISO14001: false,
          hasISO45001: true,
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).not.toContain('At least one ISO certification is required (Field 19)');
    });

    it('should pass when all ISO certifications are true', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          hasISO9001: true,
          hasISO14001: true,
          hasISO45001: true,
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).not.toContain('At least one ISO certification is required (Field 19)');
    });
  });

  // -----------------------------------------------------------------------
  // Rule 5 - APCD empanelment
  // -----------------------------------------------------------------------
  describe('Rule 5 - APCD empanelment', () => {
    it('should return error when no APCD is selected for empanelment', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          applicationApcds: [{ id: 'apcd-1', seekingEmpanelment: false }],
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('At least one APCD must be selected for empanelment (Field 22)');
    });

    it('should return error when applicationApcds is empty', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({ applicationApcds: [] }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('At least one APCD must be selected for empanelment (Field 22)');
    });

    it('should pass when at least one APCD has seekingEmpanelment true', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          applicationApcds: [
            { id: 'apcd-1', seekingEmpanelment: false },
            { id: 'apcd-2', seekingEmpanelment: true },
          ],
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).not.toContain(
        'At least one APCD must be selected for empanelment (Field 22)',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Rule 6 - Installation experience (3 per APCD type)
  // -----------------------------------------------------------------------
  describe('Rule 6 - Installation experience', () => {
    it('should return error when installation experiences are insufficient for selected APCDs', async () => {
      // 2 APCDs seeking empanelment => need 6 experiences; provide only 4
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          applicationApcds: [
            { id: 'apcd-1', seekingEmpanelment: true },
            { id: 'apcd-2', seekingEmpanelment: true },
          ],
          installationExperiences: [
            { id: 'exp-1' },
            { id: 'exp-2' },
            { id: 'exp-3' },
            { id: 'exp-4' },
          ],
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain(
        'At least 6 installation experiences required (3 per APCD type). Found: 4',
      );
    });

    it('should pass when exactly 3 experiences for 1 APCD type', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(buildValidApplication());

      const errors = await service.validateForSubmission('app-1');
      const installErrors = errors.filter((e) => e.includes('installation experiences'));
      expect(installErrors).toHaveLength(0);
    });

    it('should require 0 experiences when no APCDs seeking empanelment', async () => {
      // 0 empanelment APCDs => 0 * 3 = 0 required, no error for experiences
      // But will fail on Rule 5 for no APCD empanelment
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          applicationApcds: [],
          installationExperiences: [],
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      // Should NOT have installation experience error (0 needed, 0 found)
      const installErrors = errors.filter((e) => e.includes('installation experiences'));
      expect(installErrors).toHaveLength(0);
    });

    it('should pass with exactly 6 experiences for 2 APCD types', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          applicationApcds: [
            { id: 'apcd-1', seekingEmpanelment: true },
            { id: 'apcd-2', seekingEmpanelment: true },
          ],
          installationExperiences: Array.from({ length: 6 }, (_, i) => ({
            id: `exp-${i + 1}`,
          })),
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      const installErrors = errors.filter((e) => e.includes('installation experiences'));
      expect(installErrors).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Rule 7 - Staff requirements (2 engineers)
  // -----------------------------------------------------------------------
  describe('Rule 7 - Staff requirements', () => {
    it('should return error when fewer than 2 engineers are listed', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          staffDetails: [
            { id: 'staff-1', qualification: 'B.Tech Mechanical' },
            { id: 'staff-2', qualification: 'Diploma in Welding' },
          ],
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain(
        'At least 2 engineers with B.Tech/M.Tech qualification required (Annexure 7)',
      );
    });

    it('should return error when staff list is empty', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({ staffDetails: [] }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain(
        'At least 2 engineers with B.Tech/M.Tech qualification required (Annexure 7)',
      );
    });

    it('should pass with 2 B.Tech engineers', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          staffDetails: [
            { id: 'staff-1', qualification: 'B.Tech Mechanical' },
            { id: 'staff-2', qualification: 'B.Tech Civil' },
          ],
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).not.toContain(
        'At least 2 engineers with B.Tech/M.Tech qualification required (Annexure 7)',
      );
    });

    it('should pass with 2 M.Tech engineers', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          staffDetails: [
            { id: 'staff-1', qualification: 'M.Tech Environmental' },
            { id: 'staff-2', qualification: 'M.Tech Structural' },
          ],
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).not.toContain(
        'At least 2 engineers with B.Tech/M.Tech qualification required (Annexure 7)',
      );
    });

    it('should match qualification case-insensitively', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          staffDetails: [
            { id: 'staff-1', qualification: 'b.tech mechanical' },
            { id: 'staff-2', qualification: 'm.TECH Environmental' },
          ],
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).not.toContain(
        'At least 2 engineers with B.Tech/M.Tech qualification required (Annexure 7)',
      );
    });

    it('should pass with mix of B.Tech and M.Tech', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          staffDetails: [
            { id: 'staff-1', qualification: 'B.Tech Mechanical' },
            { id: 'staff-2', qualification: 'M.Tech Environmental' },
          ],
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).not.toContain(
        'At least 2 engineers with B.Tech/M.Tech qualification required (Annexure 7)',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Rule 8 - Mandatory documents
  // -----------------------------------------------------------------------
  describe('Rule 8 - Mandatory documents', () => {
    it('should return error for each missing mandatory document', async () => {
      // Remove all attachments => one error per mandatory doc type + geo-tag errors
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({ attachments: [] }),
      );

      const errors = await service.validateForSubmission('app-1');

      for (const doc of MANDATORY_DOCUMENTS) {
        expect(errors).toContain(`Missing mandatory document: ${doc.label}`);
      }
    });

    it('should not report missing document errors when all mandatory docs are uploaded', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(buildValidApplication());

      const errors = await service.validateForSubmission('app-1');
      const missingDocErrors = errors.filter((e) => e.startsWith('Missing mandatory document:'));
      expect(missingDocErrors).toHaveLength(0);
    });

    it('should report error for a single missing mandatory document', async () => {
      const app = buildValidApplication();
      // Remove GST_CERTIFICATE
      app.attachments = app.attachments.filter(
        (a: any) => a.documentType !== DocumentType.GST_CERTIFICATE,
      );

      (prisma.application.findUnique as jest.Mock).mockResolvedValue(app);

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('Missing mandatory document: GST Registration Certificate');
    });
  });

  // -----------------------------------------------------------------------
  // Rule 9a - Geo-tagged photos count
  // -----------------------------------------------------------------------
  describe('Rule 9a - Geo-tagged photos count', () => {
    it('should return error when fewer than 2 geo-tagged photos are uploaded', async () => {
      const app = buildValidApplication();
      app.attachments = app.attachments.filter(
        (a: any) => a.documentType !== DocumentType.GEO_TAGGED_PHOTOS,
      );
      app.attachments.push({
        id: 'geo-1',
        documentType: DocumentType.GEO_TAGGED_PHOTOS,
        hasValidGeoTag: true,
      });

      (prisma.application.findUnique as jest.Mock).mockResolvedValue(app);

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('At least 2 geo-tagged photographs are required (Field 19)');
    });

    it('should pass with exactly 2 geo-tagged photos', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(buildValidApplication());

      const errors = await service.validateForSubmission('app-1');
      expect(errors).not.toContain('At least 2 geo-tagged photographs are required (Field 19)');
    });

    it('should return error when zero geo-tagged photos are uploaded', async () => {
      const app = buildValidApplication();
      app.attachments = app.attachments.filter(
        (a: any) => a.documentType !== DocumentType.GEO_TAGGED_PHOTOS,
      );

      (prisma.application.findUnique as jest.Mock).mockResolvedValue(app);

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('At least 2 geo-tagged photographs are required (Field 19)');
    });
  });

  // -----------------------------------------------------------------------
  // Rule 9b - Geo-tagged photos validity
  // -----------------------------------------------------------------------
  describe('Rule 9b - Geo-tagged photos validity', () => {
    it('should return error when geo-tagged photos have invalid GPS data', async () => {
      const app = buildValidApplication();
      app.attachments = app.attachments.filter(
        (a: any) => a.documentType !== DocumentType.GEO_TAGGED_PHOTOS,
      );
      app.attachments.push(
        {
          id: 'geo-1',
          documentType: DocumentType.GEO_TAGGED_PHOTOS,
          hasValidGeoTag: true,
        },
        {
          id: 'geo-2',
          documentType: DocumentType.GEO_TAGGED_PHOTOS,
          hasValidGeoTag: false,
        },
      );

      (prisma.application.findUnique as jest.Mock).mockResolvedValue(app);

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('1 photo(s) are missing valid GPS geo-tag data');
    });

    it('should report count of multiple invalid photos', async () => {
      const app = buildValidApplication();
      app.attachments = app.attachments.filter(
        (a: any) => a.documentType !== DocumentType.GEO_TAGGED_PHOTOS,
      );
      app.attachments.push(
        {
          id: 'geo-1',
          documentType: DocumentType.GEO_TAGGED_PHOTOS,
          hasValidGeoTag: false,
        },
        {
          id: 'geo-2',
          documentType: DocumentType.GEO_TAGGED_PHOTOS,
          hasValidGeoTag: false,
        },
      );

      (prisma.application.findUnique as jest.Mock).mockResolvedValue(app);

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('2 photo(s) are missing valid GPS geo-tag data');
    });

    it('should not report geo-tag error when all photos have valid geo tags', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(buildValidApplication());

      const errors = await service.validateForSubmission('app-1');
      const geoErrors = errors.filter((e) => e.includes('GPS geo-tag'));
      expect(geoErrors).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Rule 10 - Payment verification
  // -----------------------------------------------------------------------
  describe('Rule 10 - Payment verification', () => {
    it('should return error when application fee payment is missing', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({ payments: [] }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('Application processing fee payment is required (Field 25)');
    });

    it('should return error when payments exist but no APPLICATION_FEE type', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          payments: [{ id: 'pay-1', paymentType: 'EMPANELMENT_FEE', status: 'COMPLETED' }],
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('Application processing fee payment is required (Field 25)');
    });

    it('should pass when APPLICATION_FEE payment exists', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(buildValidApplication());

      const errors = await service.validateForSubmission('app-1');
      expect(errors).not.toContain('Application processing fee payment is required (Field 25)');
    });
  });

  // -----------------------------------------------------------------------
  // Rule 11 - Declaration
  // -----------------------------------------------------------------------
  describe('Rule 11 - Declaration', () => {
    it('should return error when declaration is not accepted', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({ declarationAccepted: false }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors).toContain('Declaration must be accepted');
    });

    it('should pass when declaration is accepted', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(buildValidApplication());

      const errors = await service.validateForSubmission('app-1');
      expect(errors).not.toContain('Declaration must be accepted');
    });
  });

  // -----------------------------------------------------------------------
  // Multiple errors
  // -----------------------------------------------------------------------
  describe('Multiple simultaneous errors', () => {
    it('should accumulate errors from multiple failing rules', async () => {
      (prisma.application.findUnique as jest.Mock).mockResolvedValue(
        buildValidApplication({
          oemProfile: null,
          contactPersons: [],
          turnoverYear1: null,
          declarationAccepted: false,
        }),
      );

      const errors = await service.validateForSubmission('app-1');
      expect(errors.length).toBeGreaterThanOrEqual(4);
      expect(errors).toContain('Company profile (Fields 1-14) must be completed');
      expect(errors).toContain('At least one contact person is required (Field 15 or 16)');
      expect(errors).toContain('Year-wise turnover for last 3 years is required (Field 17)');
      expect(errors).toContain('Declaration must be accepted');
    });
  });
});

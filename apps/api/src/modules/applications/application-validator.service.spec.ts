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
  it('should return error when oemProfile is missing', async () => {
    (prisma.application.findUnique as jest.Mock).mockResolvedValue(
      buildValidApplication({ oemProfile: null }),
    );

    const errors = await service.validateForSubmission('app-1');
    expect(errors).toContain('Company profile (Fields 1-14) must be completed');
  });

  // -----------------------------------------------------------------------
  // Rule 2 - Contact persons
  // -----------------------------------------------------------------------
  it('should return error when there are no contact persons', async () => {
    (prisma.application.findUnique as jest.Mock).mockResolvedValue(
      buildValidApplication({ contactPersons: [] }),
    );

    const errors = await service.validateForSubmission('app-1');
    expect(errors).toContain('At least one contact person is required (Field 15 or 16)');
  });

  // -----------------------------------------------------------------------
  // Rule 3 - Turnover data
  // -----------------------------------------------------------------------
  it('should return error when any turnover year is missing', async () => {
    (prisma.application.findUnique as jest.Mock).mockResolvedValue(
      buildValidApplication({ turnoverYear2: null }),
    );

    const errors = await service.validateForSubmission('app-1');
    expect(errors).toContain('Year-wise turnover for last 3 years is required (Field 17)');
  });

  // -----------------------------------------------------------------------
  // Rule 4 - ISO certifications
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // Rule 5 - APCD empanelment
  // -----------------------------------------------------------------------
  it('should return error when no APCD is selected for empanelment', async () => {
    (prisma.application.findUnique as jest.Mock).mockResolvedValue(
      buildValidApplication({
        applicationApcds: [{ id: 'apcd-1', seekingEmpanelment: false }],
      }),
    );

    const errors = await service.validateForSubmission('app-1');
    expect(errors).toContain('At least one APCD must be selected for empanelment (Field 22)');
  });

  // -----------------------------------------------------------------------
  // Rule 6 - Installation experience (3 per APCD type)
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // Rule 7 - Staff requirements (2 engineers)
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // Rule 8 - Mandatory documents
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // Rule 9a - Geo-tagged photos count
  // -----------------------------------------------------------------------
  it('should return error when fewer than 2 geo-tagged photos are uploaded', async () => {
    // Keep mandatory docs but replace geo-tagged photos with only 1
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

  // -----------------------------------------------------------------------
  // Rule 9b - Geo-tagged photos validity
  // -----------------------------------------------------------------------
  it('should return error when geo-tagged photos have invalid GPS data', async () => {
    const app = buildValidApplication();
    // Replace geo photos with ones that have invalid geo tags
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

  // -----------------------------------------------------------------------
  // Rule 10 - Payment verification
  // -----------------------------------------------------------------------
  it('should return error when application fee payment is missing', async () => {
    (prisma.application.findUnique as jest.Mock).mockResolvedValue(
      buildValidApplication({ payments: [] }),
    );

    const errors = await service.validateForSubmission('app-1');
    expect(errors).toContain('Application processing fee payment is required (Field 25)');
  });

  // -----------------------------------------------------------------------
  // Rule 11 - Declaration
  // -----------------------------------------------------------------------
  it('should return error when declaration is not accepted', async () => {
    (prisma.application.findUnique as jest.Mock).mockResolvedValue(
      buildValidApplication({ declarationAccepted: false }),
    );

    const errors = await service.validateForSubmission('app-1');
    expect(errors).toContain('Declaration must be accepted');
  });
});

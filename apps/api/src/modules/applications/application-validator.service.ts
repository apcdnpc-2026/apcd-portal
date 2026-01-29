import { Injectable, BadRequestException } from '@nestjs/common';
import { DocumentType } from '@apcd/database';
import { MANDATORY_DOCUMENTS } from '@apcd/shared';

import { PrismaService } from '../../infrastructure/database/prisma.service';

/**
 * Validates that an application meets all completeness requirements
 * before submission (transition from DRAFT to SUBMITTED).
 */
@Injectable()
export class ApplicationValidatorService {
  constructor(private prisma: PrismaService) {}

  async validateForSubmission(applicationId: string): Promise<string[]> {
    const errors: string[] = [];

    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        oemProfile: true,
        contactPersons: true,
        applicationApcds: true,
        attachments: true,
        installationExperiences: true,
        staffDetails: true,
        payments: { where: { status: { in: ['COMPLETED', 'VERIFIED'] } } },
      },
    });

    if (!application) {
      throw new BadRequestException('Application not found');
    }

    // 1. OEM Profile must be complete
    if (!application.oemProfile) {
      errors.push('Company profile (Fields 1-14) must be completed');
    }

    // 2. At least one contact person
    if (application.contactPersons.length === 0) {
      errors.push('At least one contact person is required (Field 15 or 16)');
    }

    // 3. Turnover data
    if (!application.turnoverYear1 || !application.turnoverYear2 || !application.turnoverYear3) {
      errors.push('Year-wise turnover for last 3 years is required (Field 17)');
    }

    // 4. At least one ISO certification
    if (!application.hasISO9001 && !application.hasISO14001 && !application.hasISO45001) {
      errors.push('At least one ISO certification is required (Field 19)');
    }

    // 5. At least one APCD selected for empanelment
    const empanelmentApcds = application.applicationApcds.filter((a) => a.seekingEmpanelment);
    if (empanelmentApcds.length === 0) {
      errors.push('At least one APCD must be selected for empanelment (Field 22)');
    }

    // 6. Installation experience - min 3 per APCD type
    const apcdCount = empanelmentApcds.length;
    const requiredExperiences = apcdCount * 3;
    if (application.installationExperiences.length < requiredExperiences) {
      errors.push(
        `At least ${requiredExperiences} installation experiences required (3 per APCD type). Found: ${application.installationExperiences.length}`,
      );
    }

    // 7. Staff requirements: min 2 engineers + 1 technician
    const engineers = application.staffDetails.filter(
      (s) =>
        s.qualification.toLowerCase().includes('b.tech') ||
        s.qualification.toLowerCase().includes('m.tech'),
    );
    if (engineers.length < 2) {
      errors.push('At least 2 engineers with B.Tech/M.Tech qualification required (Annexure 7)');
    }

    // 8. Check mandatory documents
    const uploadedDocTypes = new Set(application.attachments.map((a) => a.documentType));
    for (const req of MANDATORY_DOCUMENTS) {
      if (!uploadedDocTypes.has(req.type as DocumentType)) {
        errors.push(`Missing mandatory document: ${req.label}`);
      }
    }

    // 9. Geo-tagged photos validation
    const geoPhotos = application.attachments.filter(
      (a) => a.documentType === DocumentType.GEO_TAGGED_PHOTOS,
    );
    if (geoPhotos.length < 2) {
      errors.push('At least 2 geo-tagged photographs are required (Field 19)');
    }
    const invalidGeoPhotos = geoPhotos.filter((p) => !p.hasValidGeoTag);
    if (invalidGeoPhotos.length > 0) {
      errors.push(
        `${invalidGeoPhotos.length} photo(s) are missing valid GPS geo-tag data`,
      );
    }

    // 10. Payment verification
    const hasApplicationFee = application.payments.some(
      (p) => p.paymentType === 'APPLICATION_FEE',
    );
    if (!hasApplicationFee) {
      errors.push('Application processing fee payment is required (Field 25)');
    }

    // 11. Declaration
    if (!application.declarationAccepted) {
      errors.push('Declaration must be accepted');
    }

    return errors;
  }
}

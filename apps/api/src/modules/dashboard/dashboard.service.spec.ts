import { Test, TestingModule } from '@nestjs/testing';
import {
  PrismaClient,
  ApplicationStatus,
  CertificateStatus,
  PaymentStatus,
  QueryStatus,
  Role,
} from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { DashboardService } from './dashboard.service';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    prisma = mockPrisma;
  });

  // =========================================================================
  // getOemDashboard()
  // =========================================================================

  describe('getOemDashboard', () => {
    it('should return applications, certificates, pending queries, and total payments', async () => {
      const mockApps = [
        { id: 'app-1', applicationNumber: 'APCD-2025-0001', status: ApplicationStatus.DRAFT, createdAt: new Date(), submittedAt: null },
        { id: 'app-2', applicationNumber: 'APCD-2025-0002', status: ApplicationStatus.SUBMITTED, createdAt: new Date(), submittedAt: new Date() },
      ];

      const mockCerts = [
        { id: 'cert-1', certificateNumber: 'CERT-001', status: CertificateStatus.ACTIVE, validUntil: new Date('2030-01-01') },
      ];

      prisma.application.findMany.mockResolvedValue(mockApps as any);
      prisma.certificate.findMany.mockResolvedValue(mockCerts as any);
      prisma.query.count.mockResolvedValue(2);
      prisma.payment.aggregate.mockResolvedValue({ _sum: { totalAmount: 50000 } } as any);

      const result = await service.getOemDashboard('user-1');

      expect(result.applications.recent).toHaveLength(2);
      expect(result.applications.total).toBe(2);
      expect(result.applications.statusCounts[ApplicationStatus.DRAFT]).toBe(1);
      expect(result.applications.statusCounts[ApplicationStatus.SUBMITTED]).toBe(1);
      expect(result.certificates.active).toBe(1);
      expect(result.certificates.total).toBe(1);
      expect(result.pendingQueries).toBe(2);
      expect(result.totalPayments).toBe(50000);
    });

    it('should return 0 total payments when no payments exist', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.certificate.findMany.mockResolvedValue([]);
      prisma.query.count.mockResolvedValue(0);
      prisma.payment.aggregate.mockResolvedValue({ _sum: { totalAmount: null } } as any);

      const result = await service.getOemDashboard('user-1');

      expect(result.totalPayments).toBe(0);
    });

    it('should identify expiring certificates within 60 days', async () => {
      const now = new Date();
      const thirtyDaysLater = new Date();
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

      const mockCerts = [
        { id: 'cert-1', certificateNumber: 'CERT-001', status: CertificateStatus.ACTIVE, validUntil: thirtyDaysLater },
        { id: 'cert-2', certificateNumber: 'CERT-002', status: CertificateStatus.ACTIVE, validUntil: new Date('2030-01-01') },
      ];

      prisma.application.findMany.mockResolvedValue([]);
      prisma.certificate.findMany.mockResolvedValue(mockCerts as any);
      prisma.query.count.mockResolvedValue(0);
      prisma.payment.aggregate.mockResolvedValue({ _sum: { totalAmount: null } } as any);

      const result = await service.getOemDashboard('user-1');

      expect(result.certificates.expiring).toHaveLength(1);
      expect(result.certificates.expiring[0].id).toBe('cert-1');
    });

    it('should not flag expired certificates as expiring', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      const mockCerts = [
        { id: 'cert-1', certificateNumber: 'CERT-001', status: CertificateStatus.ACTIVE, validUntil: pastDate },
      ];

      prisma.application.findMany.mockResolvedValue([]);
      prisma.certificate.findMany.mockResolvedValue(mockCerts as any);
      prisma.query.count.mockResolvedValue(0);
      prisma.payment.aggregate.mockResolvedValue({ _sum: { totalAmount: null } } as any);

      const result = await service.getOemDashboard('user-1');

      expect(result.certificates.expiring).toHaveLength(0);
    });

    it('should query only OPEN queries for the user', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.certificate.findMany.mockResolvedValue([]);
      prisma.query.count.mockResolvedValue(3);
      prisma.payment.aggregate.mockResolvedValue({ _sum: { totalAmount: null } } as any);

      await service.getOemDashboard('user-1');

      expect(prisma.query.count).toHaveBeenCalledWith({
        where: {
          application: { applicantId: 'user-1' },
          status: QueryStatus.OPEN,
        },
      });
    });

    it('should return all zero counts when user has no data', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.certificate.findMany.mockResolvedValue([]);
      prisma.query.count.mockResolvedValue(0);
      prisma.payment.aggregate.mockResolvedValue({ _sum: { totalAmount: null } } as any);

      const result = await service.getOemDashboard('empty-user');

      expect(result.applications.recent).toEqual([]);
      expect(result.applications.total).toBe(0);
      expect(result.applications.statusCounts).toEqual({});
      expect(result.certificates.active).toBe(0);
      expect(result.certificates.expiring).toEqual([]);
      expect(result.certificates.total).toBe(0);
      expect(result.pendingQueries).toBe(0);
      expect(result.totalPayments).toBe(0);
    });

    it('should not count non-ACTIVE certificates in the active count', async () => {
      const mockCerts = [
        { id: 'c1', certificateNumber: 'C-001', status: CertificateStatus.EXPIRED, validUntil: new Date('2020-01-01') },
        { id: 'c2', certificateNumber: 'C-002', status: CertificateStatus.REVOKED, validUntil: new Date('2030-01-01') },
      ];

      prisma.application.findMany.mockResolvedValue([]);
      prisma.certificate.findMany.mockResolvedValue(mockCerts as any);
      prisma.query.count.mockResolvedValue(0);
      prisma.payment.aggregate.mockResolvedValue({ _sum: { totalAmount: null } } as any);

      const result = await service.getOemDashboard('user-1');

      expect(result.certificates.active).toBe(0);
      expect(result.certificates.total).toBe(2);
    });

    it('should not flag non-ACTIVE certificates as expiring even if within 60 days', async () => {
      const thirtyDaysLater = new Date();
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

      const mockCerts = [
        { id: 'c1', certificateNumber: 'C-001', status: CertificateStatus.REVOKED, validUntil: thirtyDaysLater },
      ];

      prisma.application.findMany.mockResolvedValue([]);
      prisma.certificate.findMany.mockResolvedValue(mockCerts as any);
      prisma.query.count.mockResolvedValue(0);
      prisma.payment.aggregate.mockResolvedValue({ _sum: { totalAmount: null } } as any);

      const result = await service.getOemDashboard('user-1');

      expect(result.certificates.expiring).toHaveLength(0);
    });
  });

  // =========================================================================
  // getOfficerDashboard()
  // =========================================================================

  describe('getOfficerDashboard', () => {
    beforeEach(() => {
      // Mock getTodayStats sub-queries
      prisma.application.count.mockResolvedValue(0);
      prisma.payment.count.mockResolvedValue(0);
    });

    it('should return applications grouped by status with totals', async () => {
      prisma.application.groupBy.mockResolvedValue([
        { status: ApplicationStatus.SUBMITTED, _count: 5 },
        { status: ApplicationStatus.UNDER_REVIEW, _count: 3 },
      ] as any);
      prisma.payment.count.mockResolvedValue(2);
      prisma.application.findMany.mockResolvedValue([]);

      const result = await service.getOfficerDashboard();

      expect(result.applicationsByStatus[ApplicationStatus.SUBMITTED]).toBe(5);
      expect(result.applicationsByStatus[ApplicationStatus.UNDER_REVIEW]).toBe(3);
      expect(result.totalApplications).toBe(8);
    });

    it('should return pending payment and field verification counts', async () => {
      prisma.application.groupBy.mockResolvedValue([] as any);
      prisma.payment.count.mockResolvedValue(4);
      // application.count is called for pending field verifications AND today stats
      prisma.application.count.mockResolvedValue(7);
      prisma.application.findMany.mockResolvedValue([]);

      const result = await service.getOfficerDashboard();

      expect(result.pendingPayments).toBe(4);
      expect(result.pendingFieldVerifications).toBe(7);
    });

    it('should return 0 for pendingCommitteeReview when no committee review apps exist', async () => {
      prisma.application.groupBy.mockResolvedValue([
        { status: ApplicationStatus.SUBMITTED, _count: 3 },
      ] as any);
      prisma.payment.count.mockResolvedValue(0);
      prisma.application.findMany.mockResolvedValue([]);

      const result = await service.getOfficerDashboard();

      expect(result.pendingCommitteeReview).toBe(0);
    });

    it('should return all zero counts with empty data', async () => {
      prisma.application.groupBy.mockResolvedValue([] as any);
      prisma.payment.count.mockResolvedValue(0);
      prisma.application.count.mockResolvedValue(0);
      prisma.application.findMany.mockResolvedValue([]);

      const result = await service.getOfficerDashboard();

      expect(result.totalApplications).toBe(0);
      expect(result.pendingPayments).toBe(0);
      expect(result.pendingFieldVerifications).toBe(0);
      expect(result.pendingCommitteeReview).toBe(0);
      expect(result.recentApplications).toEqual([]);
      expect(result.applicationsByStatus).toEqual({});
      expect(result.todayStats).toEqual({
        newApplications: 0,
        submittedApplications: 0,
        paymentsReceived: 0,
      });
    });

    it('should include todayStats with new applications, submitted, and payments', async () => {
      prisma.application.groupBy.mockResolvedValue([] as any);
      prisma.application.findMany.mockResolvedValue([]);
      // application.count is called multiple times: field verification, today new, today submitted
      prisma.application.count.mockResolvedValue(5);
      prisma.payment.count.mockResolvedValue(3);

      const result = await service.getOfficerDashboard();

      expect(result.todayStats).toBeDefined();
      expect(result.todayStats).toHaveProperty('newApplications');
      expect(result.todayStats).toHaveProperty('submittedApplications');
      expect(result.todayStats).toHaveProperty('paymentsReceived');
    });

    it('should include COMMITTEE_REVIEW in pendingCommitteeReview when present', async () => {
      prisma.application.groupBy.mockResolvedValue([
        { status: ApplicationStatus.COMMITTEE_REVIEW, _count: 12 },
        { status: ApplicationStatus.SUBMITTED, _count: 3 },
      ] as any);
      prisma.payment.count.mockResolvedValue(0);
      prisma.application.findMany.mockResolvedValue([]);

      const result = await service.getOfficerDashboard();

      expect(result.pendingCommitteeReview).toBe(12);
      expect(result.totalApplications).toBe(15);
    });
  });

  // =========================================================================
  // getAdminDashboard()
  // =========================================================================

  describe('getAdminDashboard', () => {
    beforeEach(() => {
      // Defaults for all underlying queries
      prisma.application.groupBy.mockResolvedValue([] as any);
      prisma.application.count.mockResolvedValue(0);
      prisma.application.findMany.mockResolvedValue([]);
      prisma.payment.count.mockResolvedValue(0);
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
        _count: 0,
      } as any);
      prisma.user.count.mockResolvedValue(0);
      prisma.user.groupBy.mockResolvedValue([] as any);
      prisma.certificate.count.mockResolvedValue(0);
      prisma.certificate.groupBy.mockResolvedValue([] as any);
    });

    it('should include officer dashboard data plus user, certificate, and payment stats', async () => {
      prisma.user.count.mockResolvedValue(100);
      prisma.user.groupBy.mockResolvedValue([
        { role: Role.OEM, _count: 80 },
        { role: Role.OFFICER, _count: 10 },
      ] as any);
      prisma.certificate.count.mockResolvedValue(50);

      const result = await service.getAdminDashboard();

      expect(result.userStats).toBeDefined();
      expect(result.userStats.total).toBe(100);
      expect(result.certificateStats).toBeDefined();
      expect(result.paymentStats).toBeDefined();
      // Also includes officer dashboard fields
      expect(result.applicationsByStatus).toBeDefined();
    });

    it('should return all zero counts with empty data', async () => {
      const result = await service.getAdminDashboard();

      // Officer dashboard part
      expect(result.totalApplications).toBe(0);
      expect(result.pendingPayments).toBe(0);
      expect(result.pendingFieldVerifications).toBe(0);
      expect(result.pendingCommitteeReview).toBe(0);
      expect(result.applicationsByStatus).toEqual({});

      // User stats
      expect(result.userStats.total).toBe(0);
      expect(result.userStats.byRole).toEqual({});
      expect(result.userStats.activeToday).toBe(0);

      // Certificate stats
      expect(result.certificateStats.total).toBe(0);
      expect(result.certificateStats.byStatus).toEqual({});
      expect(result.certificateStats.issuedThisMonth).toBe(0);

      // Payment stats
      expect(result.paymentStats.totalAmount).toBe(0);
      expect(result.paymentStats.totalCount).toBe(0);
      expect(result.paymentStats.verifiedAmount).toBe(0);
      expect(result.paymentStats.verifiedCount).toBe(0);
      expect(result.paymentStats.pendingAmount).toBe(0);
      expect(result.paymentStats.pendingCount).toBe(0);
    });

    it('should aggregate user roles correctly', async () => {
      prisma.user.count.mockResolvedValue(50);
      prisma.user.groupBy.mockResolvedValue([
        { role: Role.OEM, _count: 30 },
        { role: Role.OFFICER, _count: 5 },
        { role: Role.COMMITTEE, _count: 3 },
        { role: Role.FIELD_VERIFIER, _count: 7 },
        { role: Role.ADMIN, _count: 2 },
        { role: Role.SUPER_ADMIN, _count: 1 },
        { role: Role.DEALING_HAND, _count: 2 },
      ] as any);

      const result = await service.getAdminDashboard();

      expect(result.userStats.byRole).toEqual({
        OEM: 30,
        OFFICER: 5,
        COMMITTEE: 3,
        FIELD_VERIFIER: 7,
        ADMIN: 2,
        SUPER_ADMIN: 1,
        DEALING_HAND: 2,
      });
    });

    it('should return payment stats with verified and pending breakdowns', async () => {
      prisma.payment.aggregate
        .mockResolvedValueOnce({ _sum: { totalAmount: 100000 }, _count: 50 } as any)  // total
        .mockResolvedValueOnce({ _sum: { totalAmount: 80000 }, _count: 40 } as any)   // verified
        .mockResolvedValueOnce({ _sum: { totalAmount: 20000 }, _count: 10 } as any);  // pending

      const result = await service.getAdminDashboard();

      expect(result.paymentStats.totalAmount).toBe(100000);
      expect(result.paymentStats.totalCount).toBe(50);
      expect(result.paymentStats.verifiedAmount).toBe(80000);
      expect(result.paymentStats.verifiedCount).toBe(40);
      expect(result.paymentStats.pendingAmount).toBe(20000);
      expect(result.paymentStats.pendingCount).toBe(10);
    });

    it('should return certificate stats with status breakdown', async () => {
      prisma.certificate.count
        .mockResolvedValueOnce(25)   // total
        .mockResolvedValueOnce(5);   // issuedThisMonth
      prisma.certificate.groupBy.mockResolvedValue([
        { status: CertificateStatus.ACTIVE, _count: 15 },
        { status: CertificateStatus.EXPIRED, _count: 10 },
      ] as any);

      const result = await service.getAdminDashboard();

      expect(result.certificateStats.total).toBe(25);
      expect(result.certificateStats.byStatus).toEqual({
        ACTIVE: 15,
        EXPIRED: 10,
      });
    });
  });

  // =========================================================================
  // getFieldVerifierDashboard()
  // =========================================================================

  describe('getFieldVerifierDashboard', () => {
    it('should return assigned count, completed count, and upcoming verifications', async () => {
      prisma.fieldReport.count.mockResolvedValue(5);
      prisma.fieldReport.findMany.mockResolvedValue([
        { id: 'report-1', visitDate: new Date('2030-01-01'), application: {} },
      ] as any);

      const result = await service.getFieldVerifierDashboard('verifier-1');

      expect(result.assignedCount).toBe(5);
      expect(result.completedCount).toBe(5);
      expect(result.upcomingVerifications).toHaveLength(1);
    });

    it('should query reports filtered by verifierId', async () => {
      prisma.fieldReport.count.mockResolvedValue(0);
      prisma.fieldReport.findMany.mockResolvedValue([]);

      await service.getFieldVerifierDashboard('verifier-1');

      expect(prisma.fieldReport.count).toHaveBeenCalledWith({
        where: { verifierId: 'verifier-1' },
      });
    });

    it('should return all zero counts with empty data', async () => {
      prisma.fieldReport.count.mockResolvedValue(0);
      prisma.fieldReport.findMany.mockResolvedValue([]);

      const result = await service.getFieldVerifierDashboard('verifier-empty');

      expect(result.assignedCount).toBe(0);
      expect(result.completedCount).toBe(0);
      expect(result.upcomingVerifications).toEqual([]);
    });

    it('should limit upcoming verifications to 10 items', async () => {
      prisma.fieldReport.count.mockResolvedValue(20);
      prisma.fieldReport.findMany.mockResolvedValue([]);

      await service.getFieldVerifierDashboard('verifier-1');

      expect(prisma.fieldReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });

    it('should order upcoming verifications by visitDate ascending', async () => {
      prisma.fieldReport.count.mockResolvedValue(0);
      prisma.fieldReport.findMany.mockResolvedValue([]);

      await service.getFieldVerifierDashboard('verifier-1');

      expect(prisma.fieldReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { visitDate: 'asc' } }),
      );
    });
  });

  // =========================================================================
  // getCommitteeDashboard()
  // =========================================================================

  describe('getCommitteeDashboard', () => {
    it('should return pending review count, my evaluations, and apps for review', async () => {
      prisma.application.count.mockResolvedValue(3);
      prisma.committeeEvaluation.count.mockResolvedValue(2);
      prisma.application.findMany.mockResolvedValue([
        {
          id: 'app-1',
          oemProfile: { companyName: 'Company A' },
          evaluations: [{ id: 'eval-1' }],
        },
        {
          id: 'app-2',
          oemProfile: { companyName: 'Company B' },
          evaluations: [],
        },
      ] as any);

      const result = await service.getCommitteeDashboard('member-1');

      expect(result.pendingReview).toBe(3);
      expect(result.myEvaluations).toBe(2);
      expect(result.applicationsForReview).toHaveLength(2);
      expect(result.applicationsForReview[0].hasMyEvaluation).toBe(true);
      expect(result.applicationsForReview[1].hasMyEvaluation).toBe(false);
    });

    it('should query evaluations filtered by evaluatorId', async () => {
      prisma.application.count.mockResolvedValue(0);
      prisma.committeeEvaluation.count.mockResolvedValue(0);
      prisma.application.findMany.mockResolvedValue([]);

      await service.getCommitteeDashboard('member-1');

      expect(prisma.committeeEvaluation.count).toHaveBeenCalledWith({
        where: { evaluatorId: 'member-1' },
      });
    });

    it('should return all zero counts with empty data', async () => {
      prisma.application.count.mockResolvedValue(0);
      prisma.committeeEvaluation.count.mockResolvedValue(0);
      prisma.application.findMany.mockResolvedValue([]);

      const result = await service.getCommitteeDashboard('member-empty');

      expect(result.pendingReview).toBe(0);
      expect(result.myEvaluations).toBe(0);
      expect(result.applicationsForReview).toEqual([]);
    });

    it('should query applications with COMMITTEE_REVIEW status', async () => {
      prisma.application.count.mockResolvedValue(0);
      prisma.committeeEvaluation.count.mockResolvedValue(0);
      prisma.application.findMany.mockResolvedValue([]);

      await service.getCommitteeDashboard('member-1');

      expect(prisma.application.count).toHaveBeenCalledWith({
        where: { status: ApplicationStatus.COMMITTEE_REVIEW },
      });
      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: ApplicationStatus.COMMITTEE_REVIEW },
        }),
      );
    });

    it('should set hasMyEvaluation=false for all apps when member has no evaluations', async () => {
      prisma.application.count.mockResolvedValue(2);
      prisma.committeeEvaluation.count.mockResolvedValue(0);
      prisma.application.findMany.mockResolvedValue([
        { id: 'app-1', oemProfile: { companyName: 'A' }, evaluations: [] },
        { id: 'app-2', oemProfile: { companyName: 'B' }, evaluations: [] },
      ] as any);

      const result = await service.getCommitteeDashboard('new-member');

      expect(result.applicationsForReview.every((a: any) => a.hasMyEvaluation === false)).toBe(true);
    });
  });

  // =========================================================================
  // getDealingHandDashboard()
  // =========================================================================

  describe('getDealingHandDashboard', () => {
    it('should return pending lab bills, uploaded lab bills, payment queries, and recent applications', async () => {
      prisma.application.count.mockResolvedValue(3);
      prisma.attachment.count.mockResolvedValue(10);
      prisma.payment.count.mockResolvedValue(2);
      prisma.application.findMany.mockResolvedValue([
        { id: 'app-1', status: ApplicationStatus.LAB_TESTING },
      ] as any);

      const result = await service.getDealingHandDashboard();

      expect(result.pendingLabBills).toBe(3);
      expect(result.uploadedLabBills).toBe(10);
      expect(result.paymentQueries).toBe(2);
      expect(result.recentApplications).toHaveLength(1);
    });

    it('should query lab test report attachments', async () => {
      prisma.application.count.mockResolvedValue(0);
      prisma.attachment.count.mockResolvedValue(0);
      prisma.payment.count.mockResolvedValue(0);
      prisma.application.findMany.mockResolvedValue([]);

      await service.getDealingHandDashboard();

      expect(prisma.attachment.count).toHaveBeenCalledWith({
        where: { documentType: 'LAB_TEST_REPORT' },
      });
    });

    it('should query VERIFICATION_PENDING payments', async () => {
      prisma.application.count.mockResolvedValue(0);
      prisma.attachment.count.mockResolvedValue(0);
      prisma.payment.count.mockResolvedValue(0);
      prisma.application.findMany.mockResolvedValue([]);

      await service.getDealingHandDashboard();

      expect(prisma.payment.count).toHaveBeenCalledWith({
        where: { status: PaymentStatus.VERIFICATION_PENDING },
      });
    });

    it('should return all zero counts with empty data', async () => {
      prisma.application.count.mockResolvedValue(0);
      prisma.attachment.count.mockResolvedValue(0);
      prisma.payment.count.mockResolvedValue(0);
      prisma.application.findMany.mockResolvedValue([]);

      const result = await service.getDealingHandDashboard();

      expect(result.pendingLabBills).toBe(0);
      expect(result.uploadedLabBills).toBe(0);
      expect(result.paymentQueries).toBe(0);
      expect(result.recentApplications).toEqual([]);
    });

    it('should query applications with LAB_TESTING status for pending count', async () => {
      prisma.application.count.mockResolvedValue(0);
      prisma.attachment.count.mockResolvedValue(0);
      prisma.payment.count.mockResolvedValue(0);
      prisma.application.findMany.mockResolvedValue([]);

      await service.getDealingHandDashboard();

      expect(prisma.application.count).toHaveBeenCalledWith({
        where: { status: ApplicationStatus.LAB_TESTING },
      });
    });

    it('should query recent applications with LAB_TESTING and FIELD_VERIFICATION statuses', async () => {
      prisma.application.count.mockResolvedValue(0);
      prisma.attachment.count.mockResolvedValue(0);
      prisma.payment.count.mockResolvedValue(0);
      prisma.application.findMany.mockResolvedValue([]);

      await service.getDealingHandDashboard();

      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: {
              in: [ApplicationStatus.LAB_TESTING, ApplicationStatus.FIELD_VERIFICATION],
            },
          },
          take: 10,
        }),
      );
    });
  });
});
